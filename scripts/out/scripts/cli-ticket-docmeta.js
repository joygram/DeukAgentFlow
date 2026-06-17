import YAML from "yaml";
export function splitTicketDocMetaSection(content = "") {
    const src = String(content || "");
    const lines = src.split(/\r?\n/);
    const start = lines.findIndex(line => /^##\s+DocMeta\s*$/i.test(line.trim()));
    if (start === -1) {
        return { body: src, docmetaRaw: "", docmeta: null };
    }
    const body = lines.slice(0, start).join("\n").trimEnd();
    const docmetaSection = lines.slice(start).join("\n").trim();
    const fence = docmetaSection.match(/```(?:ya?ml)?\s*\n([\s\S]*?)\n```/i);
    const docmetaRaw = fence ? fence[1].trim() : "";
    let docmeta = null;
    if (docmetaRaw) {
        try {
            docmeta = YAML.parse(docmetaRaw) || null;
        }
        catch {
            docmeta = null;
        }
    }
    return { body, docmetaRaw, docmeta };
}
export function buildDocMetaFrontmatterSummary(docmeta = null) {
    if (!docmeta || typeof docmeta !== "object")
        return {};
    const errors = Array.isArray(docmeta.validation?.errors)
        ? docmeta.validation.errors.map(value => String(value)).filter(Boolean)
        : [];
    return Object.fromEntries(Object.entries({
        docmetaStatus: docmeta.output_status || undefined,
        docmetaTarget: docmeta.target_state || docmeta.targetState || undefined,
        docmetaValidation: docmeta.validation?.status || undefined,
        docmetaErrors: errors.length ? errors : undefined
    }).filter(([, value]) => value !== undefined && value !== ""));
}
export function clearDocMetaFrontmatterSummary(meta = {}) {
    const next = { ...meta };
    delete next.docmeta;
    delete next.docmetaStatus;
    delete next.docmetaTarget;
    delete next.docmetaValidation;
    delete next.docmetaErrors;
    return next;
}
export function appendTicketDocMetaSection(content = "", docmeta = null) {
    const body = splitTicketDocMetaSection(content).body.trimEnd();
    if (!docmeta || typeof docmeta !== "object")
        return `${body}\n`;
    const yamlStr = YAML.stringify(docmeta).trim();
    return `${body}\n\n## DocMeta\n\n\`\`\`yaml\n${yamlStr}\n\`\`\`\n`;
}
export function buildTransitionValidationDocMeta(input = {}) {
    const { ticketId = "", phase = 1, status = "open", currentState = `phase${phase || 1}`, targetState = "", requiredSlots = [], slotValues = {}, slotSourceMap = {} } = input;
    const slots = Object.fromEntries(requiredSlots.map(slot => [slot, Boolean(slotValues[slot])]));
    const filteredSlotSourceMap = Object.fromEntries(requiredSlots.map(slot => [slot, slotSourceMap[slot] || { source: "unknown" }]));
    const errors = Object.entries(slots)
        .filter(([, passed]) => !passed)
        .map(([slot]) => slot);
    return {
        document_type: "ticket_validation",
        document_subtype: "ticket_workflow_transition_gate",
        contract_version: "documeta-0.1",
        ticket_id: ticketId,
        state: {
            name: currentState,
            phase,
            status: String(status || "open")
        },
        target_state: targetState,
        source_contract: {
            required_slots: requiredSlots,
            metadata_fields: ["ticket_id", "workspace_id", "phase", "status", "target_state", "source_path"]
        },
        slots,
        slot_source_map: filteredSlotSourceMap,
        validation: {
            status: errors.length === 0 ? "PASS" : "NEEDS_FIX",
            errors
        },
        output_status: errors.length === 0 ? "transition_allowed" : "transition_blocked",
        adapter_contracts: {
            cli: {
                action: targetState === "phase2" ? "ticket move" : "ticket workflow transition",
                stop_if_output_status: "transition_blocked"
            }
        }
    };
}
//# sourceMappingURL=cli-ticket-docmeta.js.map