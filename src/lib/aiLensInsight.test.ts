import { describe, expect, it } from "vitest";

import { parseAiLensInsightBody } from "@/lib/aiLensInsight";

describe("parseAiLensInsightBody", () => {
  it("extracts labeled sections from an AI Lens memo", () => {
    expect(
      parseAiLensInsightBody(
        [
          "質問: どこを確認するべき？",
          "AIの見立て: 問い合わせ後の導線が弱い。",
          "根拠: 商談化の記録が少ない。",
          "要点: 対応タイミングを確認する。",
          "要確認: 初回返信までの時間。",
          "次に試す一手: 返信テンプレを作る。",
        ].join("\n"),
      ),
    ).toEqual({
      question: "どこを確認するべき？",
      estimation: "問い合わせ後の導線が弱い。",
      keyPoints: "商談化の記録が少ない。 / 対応タイミングを確認する。",
      followUp: "初回返信までの時間。",
      nextAction: "返信テンプレを作る。",
    });
  });

  it("keeps unlabeled text as estimation", () => {
    expect(parseAiLensInsightBody("導線全体の説明です。")).toEqual({
      question: null,
      estimation: "導線全体の説明です。",
      keyPoints: null,
      followUp: null,
      nextAction: null,
    });
  });
});
