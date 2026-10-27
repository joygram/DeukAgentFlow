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
      const docs = YAML.parseAllDocuments(docmetaRaw)
        .map(doc => doc.toJSON())
        .filter(value => value && typeof value === "object");
      if (docs.length === 0) {
        docmeta = null;
      } else if (docs.length === 1) {
        docmeta = docs[0];
      } else {
        docmeta = Object.assign({}, ...docs);
      }
    } catch {
      docmeta = null;
    }
  }
  return { body, docmetaRaw, docmeta };
}

/** @deprecated #811 front-matter 미러 폐지. 항상 빈 객체를 반환한다(미러를 새로 쓰지 않음). */
export function buildDocMetaFrontmatterSummary(_docmeta = null) {
  return {};
}

/** 과거 티켓 front-matter에 남은 docmeta* 미러 잔재를 제거한다(정본=본문 DocMeta로 수렴). */
export function clearDocMetaFrontmatterSummary(meta: Record<string, any> = {}) {
  const next = { ...meta };
  delete next.docmeta;
  delete next.docmetaStatus;
  delete next.docmetaTarget;
  delete next.docmetaValidation;
  delete next.docmetaErrors;
  return next;
}

const DOCMETA_IMMUTABLE_KEYS = [
  "document_type",
  "document_subtype",
  "contract_version",
  "ticket_id",
  "source_contract",
  "adapter_contracts"
];
const DOCMETA_UPDATABLE_KEYS = [
  "state",
  "target_state",
  "slots",
  "slot_source_map",
  "validation",
  "output_status"
];

function pickKeys(obj: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function splitDocMetaContract(docmeta: Record<string, any> = {}) {
  return {
    immutable: pickKeys(docmeta || {}, DOCMETA_IMMUTABLE_KEYS),
    updatable: pickKeys(docmeta || {}, DOCMETA_UPDATABLE_KEYS)
  };
}

/**
 * #811: 기존 DocMeta의 불변부는 보존하고 업데이트부만 새 값으로 교체한다.
 * existing이 없으면(최초 생성) next를 그대로 정본으로 쓴다.
 */
export function mergeDocMetaUpdate(existing: Record<string, any> = null, next: Record<string, any> = null) {
  if (!next || typeof next !== "object") return existing || null;
  if (!existing || typeof existing !== "object") return next;
  const { immutable } = splitDocMetaContract(existing);
  const { updatable } = splitDocMetaContract(next);
  const { immutable: nextImmutable } = splitDocMetaContract(next);
  return { ...nextImmutable, ...immutable, ...updatable };
}

export function appendTicketDocMetaSection(content = "", docmeta = null) {
  const body = splitTicketDocMetaSection(content).body.trimEnd();
  if (!docmeta || typeof docmeta !== "object") return `${body}\n`;
  const { immutable, updatable } = splitDocMetaContract(docmeta);
  const immutableYaml = YAML.stringify(immutable).trim();
  const updatableYaml = YAML.stringify(updatable).trim();
  const yamlStr = `${immutableYaml}\n---\n${updatableYaml}`;
  return `${body}\n\n## DocMeta\n\n\`\`\`yaml\n${yamlStr}\n\`\`\`\n`;
}

export function buildTransitionValidationDocMeta(input: Record<string, any> = {}) {
  const {
    ticketId = "",
    phase = 1,
    status = "open",
    currentState = `phase${phase || 1}`,
    targetState = "",
    requiredSlots = [],
    slotValues = {},
    slotSourceMap = {}
  } = input;
  const slots = Object.fromEntries(requiredSlots.map(slot => [slot, Boolean(slotValues[slot])]));
  const filteredSlotSourceMap = Object.fromEntries(
    requiredSlots.map(slot => [slot, slotSourceMap[slot] || { source: "unknown" }])
  );
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
