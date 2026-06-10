/**
 * 情侣问答题库与「每日一题」选择逻辑。
 * 每天根据 UTC 天数索引轮换一道题；题键取服务器本地日期 'YYYY-MM-DD'，
 * 用于按天隔离每对情侣的作答（与 QaAnswer.questionKey 对应）。
 */

/** 约 25 道温暖的情侣问答题（中文）。 */
export const QA_QUESTIONS: string[] = [
  '你最想和我一起去的地方是哪里？',
  '最近让你最有安全感的瞬间是什么？',
  '如果周末完全自由，你想怎么过？',
  '我做的哪件小事最让你心动？',
  '你心里我们最难忘的一次约会是哪一次？',
  '最近有什么事情让你特别想和我分享？',
  '你希望我们五年后过着怎样的生活？',
  '我身上你最喜欢的一个特质是什么？',
  '如果今晚只能做一件事，你想和我一起做什么？',
  '你最近一次因为我而笑出声是什么时候？',
  '有什么话你一直想对我说却还没说出口？',
  '你理想中的一个普通幸福日常是什么样子？',
  '我们之间哪个习惯或默契是你最珍惜的？',
  '你最近遇到的压力，希望我怎么陪你度过？',
  '如果可以重温我们的一个回忆，你会选哪一个？',
  '你觉得我们关系里最需要一起努力的地方是什么？',
  '什么样的小惊喜最能让你开心一整天？',
  '你最想和我一起养成的一个新习惯是什么？',
  '在我面前，你觉得最放松的时刻是什么时候？',
  '你希望我们下一个纪念日怎么庆祝？',
  '我说过的哪句话你一直记到现在？',
  '你最想和我一起尝试但还没机会做的事是什么？',
  '今天有什么瞬间让你想起了我？',
  '你觉得我们是从什么时候开始真正靠近彼此的？',
  '如果用一个词形容现在的我们，你会选哪个词？',
];

/** 取今天的问题：键为服务器本地日期 'YYYY-MM-DD'，文案按 UTC 天数轮换。 */
export function pickQuestionForToday(): { key: string; text: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const key = `${year}-${month}-${day}`;

  const index = Math.floor(Date.now() / 86400000) % QA_QUESTIONS.length;
  const text = QA_QUESTIONS[index];

  return { key, text };
}
