import type { DataMap, DataPoint } from "./schema.js";
import { DataMapSchema } from "./schema.js";
import { sortDataMap } from "./merge.js";

/** Fields the dpdp-map skill may write. Scanner zone is not on this type. */
export interface HumanZoneEdit {
  id: string;
  name?: string;
  category?: DataPoint["category"];
  flags?: DataPoint["flags"];
  purpose?: string;
  basis?: DataPoint["basis"];
  retention_stated?: string;
  notes?: string;
  consent_gate?: string | null;
  answers?: DataPoint["answers"];
}

/**
 * Apply confirmed answers to the human zone. Unknown data points, unknown
 * questions, and consent gates the map does not already contain are refused.
 */
export function writeHumanZone(map: DataMap, edits: HumanZoneEdit[]): DataMap {
  const points = map.data_points.map((point) => ({
    ...point,
    flags: [...point.flags],
    aliases: [...point.aliases],
    observed: point.observed.map((obs) => ({ ...obs })),
    recipients: point.recipients.map((recipient) => ({
      ...recipient,
      observed: recipient.observed.map((obs) => ({ ...obs })),
    })),
    retention: { stated: point.retention.stated, signals: point.retention.signals.map((signal) => ({ ...signal })) },
    answers: { ...point.answers },
  }));

  for (const edit of edits) {
    const point = points.find((candidate) => candidate.id === edit.id || candidate.aliases.includes(edit.id));
    if (!point) throw new Error(`no data point ${edit.id}`);
    if (edit.name !== undefined) point.name = edit.name;
    if (edit.category !== undefined) point.category = edit.category;
    if (edit.flags !== undefined) point.flags = [...edit.flags];
    if (edit.purpose !== undefined) point.purpose = edit.purpose;
    if (edit.basis !== undefined) point.basis = edit.basis;
    if (edit.retention_stated !== undefined) point.retention.stated = edit.retention_stated;
    if (edit.notes !== undefined) point.notes = edit.notes;
    if (edit.consent_gate !== undefined) {
      if (edit.consent_gate && !map.consent_gates.some((gate) => gate.id === edit.consent_gate)) {
        throw new Error(`no consent gate ${edit.consent_gate}`);
      }
      point.consent_gate = edit.consent_gate;
    }
    if (edit.answers) {
      for (const questionId of Object.keys(edit.answers)) {
        const question = map.questions.find((item) => item.id === questionId);
        if (!question) throw new Error(`no question ${questionId}`);
        if (question.data_point && question.data_point !== point.id && !point.aliases.includes(question.data_point)) {
          throw new Error(`question ${questionId} belongs to ${question.data_point}`);
        }
      }
      point.answers = { ...point.answers, ...edit.answers };
    }
  }

  return sortDataMap(
    DataMapSchema.parse({
      ...map,
      data_points: points,
    }),
  );
}
