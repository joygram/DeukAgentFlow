export function renderTicketWorkflowGateFailure({ ticketId = "<ticket-id>", workspace = "", docmeta = {}, reasons = [] } = {}) {
    const missing = [...new Set([...(reasons || []), ...(docmeta.validation?.errors || [])])];
    const phase1Reasons = docmeta.slot_source_map?.phase1Plan?.errors || [];
    const lines = [
        `[APPROVAL GATE BLOCKED] Ticket ${ticketId} cannot enter execution yet.`,
        "This is a single-pass gate: satisfy every missing slot below, then run the one command shown.",
        "",
        "Missing slots:"
    ];
    const slotLabels = {
        phase1Plan: "Phase 1 ticket body is complete",
        userApproval: "User approved the reviewed ticket and Phase 2 transition",
        executionEvidence: "Execution evidence is present",
        verificationEvidence: "Verification evidence is present",
        debuggingDecision: "Debugging decision is present",
        completionEvidence: "Completion evidence is present",
        reopenDecision: "Reopen decision is present"
    };
    for (const slot of Object.keys(docmeta.slots || {})) {
        if (docmeta.slots[slot])
            continue;
        lines.push(`- ${slot}: ${slotLabels[slot] || "required evidence is missing"}`);
    }
    if (phase1Reasons.length > 0) {
        lines.push("");
        lines.push(`Phase 1 body gaps: ${phase1Reasons.join(", ")}`);
    }
    if (missing.length > 0) {
        lines.push(`Reason codes: ${missing.join(", ")}`);
    }
    lines.push("");
    // #633: workspace comes ONLY from --workspace (registry); cwd is never used. Pre-announce
    // so the agent always passes --workspace — omitting it errors out.
    lines.push("NOTE: workspace is resolved ONLY from --workspace (registry); cwd is never used.");
    lines.push("Omitting --workspace will error out, so always pass it on every ticket command.");
    lines.push("");
    lines.push("Run ONLY after the user types approval in chat (승인/approved/yes/진행해):");
    lines.push("```bash");
    lines.push(`deuk-agent-flow ticket move --id ${ticketId} --workspace ${workspace || "<workspace-id>"} --phase 2 --approval approved --non-interactive`);
    lines.push("```");
    lines.push("");
    // #641: give the agent the legitimate exit so a blocked gate never tempts it into
    // forging approval or forcing a phase jump. discard only works on unapproved Phase 1 tickets.
    lines.push("Do NOT self-approve (running --approval approved without the user's chat approval),");
    lines.push("and do NOT force a phase jump. If this unapproved Phase 1 ticket should be abandoned, discard it:");
    lines.push("```bash");
    lines.push(`deuk-agent-flow ticket discard --id ${ticketId} --workspace ${workspace || "<workspace-id>"} --non-interactive`);
    lines.push("```");
    lines.push("");
    lines.push(`DocMeta validation: ${docmeta.validation?.status || "UNKNOWN"}`);
    return lines.join("\n");
}
//# sourceMappingURL=cli-ticket-surface.js.map