import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('fixtures', type=Path)
parser.add_argument('--themes', type=Path, required=True)
parser.add_argument('--browser', required=True)
args = parser.parse_args()


def theme(path):
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    return {**(theme(path.parent / data['include']) if 'include' in data else {}), **data.get('colors', {})}


results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=args.browser)
    for name, filename in [('light', 'light_modern.json'), ('dark', 'dark_modern.json'), ('high-contrast', 'hc_black.json'), ('high-contrast-light', 'hc_light.json')]:
        dark = name in ['dark', 'high-contrast']
        colors = {
            'foreground': '#cccccc' if dark else '#333333',
            'descriptionForeground': '#aaaaaa' if dark else '#606060',
            'sideBar.background': '#181818' if dark else '#f8f8f8',
            'editor.background': '#1f1f1f' if dark else '#ffffff',
            'editorWidget.background': '#252526' if dark else '#f3f3f3',
            'widget.border': '#454545' if dark else '#b8b8b8',
            'widget.shadow': '#00000050',
            'button.background': '#0078d4' if dark else '#005fb8', 'button.foreground': '#ffffff',
            'button.hoverBackground': '#0069bf', 'button.secondaryBackground': '#313131' if dark else '#e5e5e5',
            'button.secondaryForeground': '#cccccc' if dark else '#333333',
            'button.secondaryHoverBackground': '#454545' if dark else '#dddddd',
            'input.background': '#313131' if dark else '#ffffff', 'input.foreground': '#cccccc' if dark else '#333333',
            'input.border': '#454545' if dark else '#b8b8b8',
            'dropdown.background': '#313131' if dark else '#ffffff', 'dropdown.foreground': '#cccccc' if dark else '#333333',
            'focusBorder': '#0078d4', 'textLink.foreground': '#4daafc' if dark else '#005fb8',
            'toolbar.hoverBackground': '#80808020',
            'testing.iconPassed': '#73c991' if dark else '#137c38', 'editorWarning.foreground': '#cca700', 'errorForeground': '#f14c4c',
            'list.hoverBackground': '#2a2d2e' if dark else '#e8e8e8', 'list.hoverForeground': '#cccccc' if dark else '#333333',
            'list.inactiveSelectionBackground': '#37373d' if dark else '#e4e6f1', 'list.inactiveSelectionForeground': '#ffffff' if dark else '#333333',
            'disabledForeground': '#888888' if dark else '#707070', 'progressBar.background': '#0078d4',
            'checkbox.background': '#313131' if dark else '#ffffff',
        }
        if name == 'high-contrast':
            colors.update({
                'foreground': '#ffffff', 'descriptionForeground': '#ffffff',
                'sideBar.background': '#000000', 'editorWidget.background': '#000000',
                'input.background': '#000000', 'input.foreground': '#ffffff',
                'dropdown.background': '#000000', 'dropdown.foreground': '#ffffff',
                'button.background': '#000000', 'button.foreground': '#ffffff',
                'button.secondaryBackground': '#000000', 'button.secondaryForeground': '#ffffff',
                'contrastBorder': '#6fc3df', 'contrastActiveBorder': '#f38518',
                'focusBorder': '#f38518', 'textLink.foreground': '#3794ff',
                'list.inactiveSelectionBackground': '#000000', 'list.inactiveSelectionForeground': '#ffffff',
            })
        elif name == 'high-contrast-light':
            colors.update({
                'foreground': '#292929', 'descriptionForeground': '#292929',
                'sideBar.background': '#ffffff', 'editorWidget.background': '#ffffff',
                'contrastBorder': '#0f4a85', 'contrastActiveBorder': '#0f4a85', 'focusBorder': '#0f4a85',
            })
        colors.update(theme(args.themes / filename))
        variables = ';'.join(f'--vscode-{key.replace(".", "-")}:{value}' for key, value in colors.items() if isinstance(value, str))
        variables += ';--vscode-font-family:Arial,sans-serif;--vscode-font-size:13px'
        for state in ['workspace', 'skill', 'empty', 'loading']:
            page = browser.new_page(viewport={'width': 360, 'height': 900})
            page.add_init_script('window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:()=>{}})')
            page.goto((args.fixtures / f'{state}.html').resolve().as_uri())
            page.evaluate('([style,kind])=>{document.documentElement.style.cssText=style;document.body.classList.add("vscode-"+kind)}', [variables, name])
            computed = page.evaluate('''()=>{
              const color=(selector,property)=>getComputedStyle(document.querySelector(selector))[property];
              return {body:color('body','backgroundColor'),button:document.querySelector('.create-ticket-cta')?color('.create-ticket-cta','backgroundColor'):null,overflow:document.documentElement.scrollWidth>innerWidth,focus:color('body','color'),images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)};
            }''')
            expected = page.evaluate('(color)=>{let e=document.createElement("div");e.style.backgroundColor=color;document.body.append(e);let c=getComputedStyle(e).backgroundColor;e.remove();return c}', colors['sideBar.background'])
            assert computed['body'] == expected, (name, state, computed, expected)
            assert not computed['overflow'], (name, state, 'horizontal overflow')
            assert computed['images'], (name, state, 'missing image')
            if state == 'empty':
                button_color = page.evaluate('(color)=>{let e=document.createElement("div");e.style.backgroundColor=color;document.body.append(e);let c=getComputedStyle(e).backgroundColor;e.remove();return c}', colors['button.secondaryBackground'])
                assert computed['button'] == button_color
                page.evaluate('document.documentElement.style.setProperty("--vscode-button-secondaryBackground", "rgb(100, 20, 130)")')
                assert page.locator('.create-ticket-cta').evaluate('(e)=>getComputedStyle(e).backgroundColor') == 'rgb(100, 20, 130)'
                page.evaluate('(color)=>document.documentElement.style.setProperty("--vscode-button-secondaryBackground",color)', colors['button.secondaryBackground'])
            if state == 'workspace':
                page.locator('[data-action="toggle-settings"]').click()
                assert page.locator('.global-config').is_visible()
                page.screenshot(path=str(args.fixtures / f'{name}-settings.png'))
                page.locator('[data-action="close-settings"]').click()
                assert not page.locator('.global-config').is_visible()
                page.keyboard.press('Tab')
                page.locator('[data-action="toggle-settings"]').focus()
                assert page.locator('[data-action="toggle-settings"]').evaluate('(e)=>getComputedStyle(e).outlineStyle') != 'none'
            page.screenshot(path=str(args.fixtures / f'{name}-{state}.png'))
            results.append({'theme': name, 'state': state, **computed})
            page.close()
    browser.close()
(args.fixtures / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'PASS: {len(results)} actual webview/theme combinations; backgrounds, images, overflow, settings and focus.')
