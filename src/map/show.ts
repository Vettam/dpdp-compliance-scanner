import type { Finding, Question } from "../types.js";
import type { DataMap, MapQuestion } from "./schema.js";

export function openQuestions(map: DataMap): MapQuestion[] {
  const answered = new Set<string>();
  for (const dp of map.data_points) {
    for (const id of Object.keys(dp.answers)) answered.add(id);
  }
  return map.questions.filter((q) => !answered.has(q.id));
}

export function renderMapShow(map: DataMap, findings: Finding[], catalogueQuestions: Question[] = []): string {
  const stale = map.data_points.filter((d) => d.stale).length;
  const questions = openQuestions(map);
  const lines = [
    `${map.data_points.length} data points (${stale} stale) · ${map.consent_gates.length} consent gates · ${questions.length} open questions`,
    "",
  ];
  for (const dp of map.data_points) {
    lines.push(`${dp.id}  ${dp.category}${dp.stale ? "  stale" : ""}  ${dp.name}`);
  }
  if (findings.length > 0) {
    lines.push("");
    for (const f of findings) lines.push(`${f.certainty.toUpperCase()}  ${f.rule_id}  ${f.title}`);
  }
  if (catalogueQuestions.length > 0) {
    lines.push("");
    for (const q of catalogueQuestions) lines.push(`QUESTION  ${q.rule_id}  ${q.prompt}`);
  }
  if (questions.length > 0) {
    lines.push("");
    for (const q of questions) lines.push(`QUESTION  ${q.ask}`);
  }
  return lines.join("\n");
}

export function renderMapShowJson(map: DataMap, findings: Finding[], catalogueQuestions: Question[] = []): string {
  return (
    JSON.stringify(
      { ...map, findings, catalogue_questions: catalogueQuestions, open_questions: openQuestions(map) },
      null,
      2,
    ) + "\n"
  );
}
