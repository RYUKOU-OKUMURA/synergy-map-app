export function parseAiLensInsightBody(body: string) {
  const questionMatch = body.match(/^質問:\s*(.+?)(?:\n|$)/);
  const question = questionMatch?.[1]?.trim() ?? null;
  const withoutQuestion = body.replace(/^質問:\s*.+?(?:\n|$)/, "").trim();
  const labels = [
    "AIの見立て:",
    "根拠:",
    "要点:",
    "要確認:",
    "次に聞くこと:",
    "次に試す一手:",
  ];

  function section(label: string) {
    const startIndex = withoutQuestion.indexOf(label);
    if (startIndex < 0) return null;
    const contentStart = startIndex + label.length;
    const contentEnd = labels
      .map((candidate) => withoutQuestion.indexOf(candidate, contentStart))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    return withoutQuestion
      .slice(contentStart, contentEnd ?? withoutQuestion.length)
      .trim();
  }

  const labeledEstimation = section("AIの見立て:");
  const evidence = section("根拠:");
  const keyPoints = section("要点:");
  const followUp = section("要確認:") ?? section("次に聞くこと:");
  const nextAction = section("次に試す一手:");
  const sectionStarts = labels
    .map((label) => withoutQuestion.indexOf(label))
    .filter((index) => index >= 0);
  const estimationEnd = sectionStarts.length > 0 ? Math.min(...sectionStarts) : -1;
  const estimation =
    labeledEstimation ??
    (estimationEnd >= 0
      ? withoutQuestion.slice(0, estimationEnd).trim()
      : withoutQuestion.trim());
  return {
    question,
    estimation: estimation || withoutQuestion,
    keyPoints: [evidence, keyPoints].filter(Boolean).join(" / ") || null,
    followUp,
    nextAction,
  };
}
