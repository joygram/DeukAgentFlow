"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tf = exports.t = exports.detectUiLang = void 0;
const vscode = require("vscode");
function detectUiLang() {
    const lang = (vscode.env.language || 'en').toLowerCase();
    return lang.startsWith('ko') ? 'ko' : 'en';
}
exports.detectUiLang = detectUiLang;
const KO = {
    // 패널 헤더 / 탭
    panelTitle: 'AgentFlow 패널',
    tabWorkspace: '워크스페이스',
    tabSkill: '스킬',
    settings: '설정',
    help: '도움말',
    refresh: '새로고침',
    // 상태 필터
    filter: '필터',
    filterOpen: '열린 티켓',
    filterClosed: '닫힌 티켓',
    filterAll: '전체 티켓',
    // 툴바
    handoff: '핸드오프',
    handoffTitle: '현재 티켓 핸드오프를 클립보드로 복사합니다.',
    lifecycleTitle: '선택한 티켓 상태 또는 제거',
    lifecyclePlaceholder: '상태 변경',
    selectionSelected: (n) => `${n}개 선택`,
    selectionTickets: (shown, total) => `${shown} / ${total} 티켓`,
    ticketsCountBadge: (shown, total) => `${shown} / ${total} 티켓`,
    noWorkspace: '워크스페이스 없음',
    // 빈 상태 + 생성 유도 CTA
    ticketsEmptyTitle: '표시할 티켓이 없어요.',
    ticketsEmptyHint: '활성 티켓이 없어요. 새 티켓을 만들어 작업을 시작하세요.',
    createTicketCta: '+ 티켓 만들기',
    createTicketTitle: '새 티켓을 생성합니다.',
    createTicketPrompt: '새 작업을 시작하고 싶어요. 현재 워크스페이스에 어떤 작업이 필요한지 파악해서 새 티켓을 만들어 주세요.',
    createTicketSentDirect: '티켓 생성 요청을 {target}에 바로 보냈어요.',
    createTicketSentAttempted: '티켓 생성 요청을 {target}에 보내려 시도했고 클립보드에도 준비했어요. 입력창 반영은 직접 확인해 주세요.',
    createTicketSentClipboard: '티켓 생성 요청을 클립보드에 준비했어요. {target}에서 붙여넣으면 됩니다.',
    ticketListLoading: '티켓 목록을 불러오는 중…',
    loading: '로딩 중…',
    // 스킬 탭
    skillsRefresh: '스킬 새로고침',
    skillsLoading: '스킬 목록을 불러오는 중…',
    skillsEmpty: '스킬 없음 · ↻ 로 불러오기',
    // 알림(showInformationMessage)
    noActiveTicket: '활성 티켓이 없어요.',
    noSelectedTicket: '선택한 티켓이 없어요.',
    handoffCopied: '핸드오프 스냅샷을 클립보드에 복사했어요.',
    nothingToSend: '전달할 내용이 없어요.',
    commandAlreadyRunning: '이미 실행 중인 AgentFlow 명령이 있어요.',
};
const EN = {
    panelTitle: 'AgentFlow Panel',
    tabWorkspace: 'Workspace',
    tabSkill: 'Skill',
    settings: 'Settings',
    help: 'Help',
    refresh: 'Refresh',
    filter: 'Filter',
    filterOpen: 'Open tickets',
    filterClosed: 'Closed tickets',
    filterAll: 'All tickets',
    handoff: 'handoff',
    handoffTitle: 'Copy the current ticket handoff to the clipboard.',
    lifecycleTitle: 'Change selected ticket status or remove',
    lifecyclePlaceholder: 'Change status',
    selectionSelected: (n) => `${n} selected`,
    selectionTickets: (shown, total) => `${shown} / ${total} tickets`,
    ticketsCountBadge: (shown, total) => `${shown} / ${total} tickets`,
    noWorkspace: 'No workspace',
    ticketsEmptyTitle: 'No tickets to show.',
    ticketsEmptyHint: 'No active ticket. Create a new ticket to start working.',
    createTicketCta: '+ Create ticket',
    createTicketTitle: 'Create a new ticket.',
    createTicketPrompt: 'I want to start new work. Please figure out what needs doing in the current workspace and create a new ticket.',
    createTicketSentDirect: 'Sent the create-ticket request directly to {target}.',
    createTicketSentAttempted: 'Tried sending the create-ticket request to {target} and also prepared it on the clipboard. Please verify it landed in the input box.',
    createTicketSentClipboard: 'Prepared the create-ticket request on the clipboard. Paste it into {target}.',
    ticketListLoading: 'Loading tickets…',
    loading: 'Loading…',
    skillsRefresh: 'Refresh skills',
    skillsLoading: 'Loading skills…',
    skillsEmpty: 'No skills · load with ↻',
    noActiveTicket: 'No active ticket.',
    noSelectedTicket: 'No ticket selected.',
    handoffCopied: 'Copied the handoff snapshot to the clipboard.',
    nothingToSend: 'Nothing to send.',
    commandAlreadyRunning: 'An AgentFlow command is already running.',
};
const TABLES = { ko: KO, en: EN };
// 정적 문자열 조회. 누락 시 영어 → 키 순으로 폴백한다.
function t(key, lang = detectUiLang()) {
    const value = TABLES[lang][key] ?? EN[key] ?? key;
    return typeof value === 'string' ? value : key;
}
exports.t = t;
// 숫자 인자가 있는 동적 문자열 조회(예: '3개 선택' / '3 selected').
function tf(key, ...args) {
    const lang = detectUiLang();
    const value = (TABLES[lang][key] ?? EN[key]);
    if (typeof value === 'function') {
        return value(...args);
    }
    return typeof value === 'string' ? value : key;
}
exports.tf = tf;
//# sourceMappingURL=i18n.js.map