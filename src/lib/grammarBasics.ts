// 기본 문법: 영어 문장 5형식 (직접 작성한 내용 - 의학·재활 예문)
// 앱에 처음부터 들어 있는 항목이라 저장/동기화 데이터에는 넣지 않는다.
// 사용자가 바꾸는 것은 '알아요/공부 중' 상태뿐이고, 그것만 data.grammar에 저장된다.
import type { AppData, GrammarExample, GrammarItem, GrammarQuiz } from './types';

const BASIC_DATE = '2026-10-15T00:00:00.000Z';

function ex(sentence: string, ko: string, part: string): GrammarExample {
  return { docId: '', docTitle: '기본 예문', page: 0, sentence, ko, part };
}

function make(
  n: number,
  name: string,
  nameEn: string,
  explanation: string,
  usage: string,
  examples: GrammarExample[],
  quiz: GrammarQuiz[],
): GrammarItem {
  return {
    id: `basic-pattern-${n}`,
    name,
    nameEn,
    explanation,
    usage,
    examples,
    quiz,
    status: 'learning',
    createdAt: BASIC_DATE,
    updatedAt: BASIC_DATE,
    builtin: true,
  };
}

export const BASIC_GRAMMAR: GrammarItem[] = [
  make(
    1,
    '1형식 (S+V)',
    'Sentence pattern 1: S + V',
    '주어(S)와 동사(V)만으로 뜻이 완성되는 문장이에요. 동사 뒤에 목적어나 보어가 필요 없어요. 뒤에 시간·장소·방법을 말해 주는 말(부사)이 붙어도 문장의 뼈대는 그대로 1형식이에요.',
    '자주 쓰는 동사: occur(일어나다), appear(나타나다), recover(회복하다), improve(좋아지다), decrease(줄어들다), exist(존재하다)',
    [
      ex('The pain disappeared.', '통증이 사라졌다.', 'S The pain / V disappeared'),
      ex('The patient recovered quickly.', '환자는 빠르게 회복했다.', 'S The patient / V recovered (+ 부사 quickly)'),
      ex('Symptoms usually appear within hours.', '증상은 보통 몇 시간 안에 나타난다.', 'S Symptoms / V appear (+ 부사구 within hours)'),
    ],
    [
      {
        q: '다음 중 1형식 문장은?',
        choices: ['The swelling decreased.', 'The swelling is severe.', 'The swelling worsens the pain.'],
        answer: 0,
        explain: 'decreased(줄었다) 뒤에 아무것도 필요 없어서 S+V예요. is severe는 보어가 있는 2형식, worsens the pain은 목적어가 있는 3형식이에요.',
      },
      {
        q: '"The patient recovered quickly."에서 quickly의 역할은?',
        choices: ['목적어', '보어', '동사를 꾸며 주는 말(없어도 문장이 완성됨)'],
        answer: 2,
        explain: 'quickly(빠르게)는 어떻게 회복했는지 덧붙이는 부사라서 문장의 뼈대(S+V)에 들어가지 않아요. 그래서 1형식이에요.',
      },
      {
        q: 'The symptoms ____ in the morning.',
        choices: ['appear', 'make', 'give'],
        answer: 0,
        explain: 'appear는 목적어 없이 쓰는 동사라서 1형식이 돼요. make와 give는 뒤에 목적어가 꼭 필요해서 어색해요.',
      },
    ],
  ),
  make(
    2,
    '2형식 (S+V+C)',
    'Sentence pattern 2: S + V + C',
    '동사 뒤에 보어(C)가 와서 주어가 어떤 상태인지, 무엇인지를 설명해 주는 문장이에요. 보어는 주어와 같은 말이에요(주어 = 보어). 보어 자리에는 형용사나 명사가 와요.',
    '자주 쓰는 동사: be(~이다), become(~이 되다), seem(~처럼 보이다), feel(~하게 느껴지다), look(~해 보이다), remain(계속 ~이다), stay(~인 채로 있다)',
    [
      ex('The muscle feels tight.', '그 근육은 뻣뻣하게 느껴진다.', 'S The muscle / V feels / C tight'),
      ex('She became a physical therapist.', '그녀는 물리치료사가 되었다.', 'S She / V became / C a physical therapist'),
      ex('The patient remained stable.', '환자는 안정된 상태를 유지했다.', 'S The patient / V remained / C stable'),
    ],
    [
      {
        q: 'The muscle ____ tight.',
        choices: ['feels', 'hurts it', 'walks'],
        answer: 0,
        explain: 'feels(~하게 느껴진다) 뒤에는 상태를 말하는 형용사 tight가 와서 주어의 상태를 설명해요. 이런 동사를 연결동사라고 불러요.',
      },
      {
        q: '2형식에서 보어(C)는 무엇을 설명하나요?',
        choices: ['주어의 상태나 정체', '동작을 받는 대상', '동작이 일어난 시간'],
        answer: 0,
        explain: '보어는 주어 = 보어 관계예요. The muscle = tight처럼, 주어가 어떤 상태인지 알려 줘요.',
      },
      {
        q: '다음 중 2형식 문장은?',
        choices: ['She became a physical therapist.', 'She helped a physical therapist.', 'She gave a physical therapist advice.'],
        answer: 0,
        explain: 'She = a physical therapist(그녀 = 물리치료사)로 주어와 같아서 2형식이에요. helped의 대상은 다른 사람(3형식), gave는 4형식이에요.',
      },
    ],
  ),
  make(
    3,
    '3형식 (S+V+O)',
    'Sentence pattern 3: S + V + O',
    '동사 뒤에 목적어(O)가 와서 "~을/를 ~하다"라는 뜻이 되는 문장이에요. 영어에서 가장 많이 쓰이는 형식이에요. 목적어는 주어와 다른 대상이에요(주어 ≠ 목적어).',
    '자주 쓰는 동사: measure(측정하다), reduce(줄이다), need(필요로 하다), improve(개선하다), treat(치료하다), perform(수행하다). 논문 문장 대부분이 3형식이에요.',
    [
      ex('The therapist measured the range of motion.', '치료사는 관절 가동범위를 측정했다.', 'S The therapist / V measured / O the range of motion'),
      ex('Exercise reduces pain.', '운동은 통증을 줄여 준다.', 'S Exercise / V reduces / O pain'),
      ex('The patient needs rest.', '환자는 휴식이 필요하다.', 'S The patient / V needs / O rest'),
    ],
    [
      {
        q: '"The therapist measured the range of motion."에서 목적어(O)는?',
        choices: ['The therapist', 'measured', 'the range of motion'],
        answer: 2,
        explain: '"무엇을 측정했나?"에 대한 답이 목적어예요. 측정한 대상은 the range of motion(관절 가동범위)이에요.',
      },
      {
        q: 'Exercise ____ pain.',
        choices: ['reduces', 'reduces of', 'reducing'],
        answer: 0,
        explain: '주어 Exercise는 단수라서 동사에 s를 붙인 reduces를 써요. 목적어 pain 앞에는 전치사 없이 바로 와요.',
      },
      {
        q: '다음 중 3형식 문장은?',
        choices: ['The patient needs rest.', 'The patient seems tired.', 'The patient gave me a note.'],
        answer: 0,
        explain: 'needs(필요로 하다) 뒤에 목적어 rest 하나만 와서 3형식이에요. seems tired는 2형식, gave me a note는 4형식이에요.',
      },
    ],
  ),
  make(
    4,
    '4형식 (S+V+IO+DO)',
    'Sentence pattern 4: S + V + IO + DO',
    '목적어가 두 개 오는 문장이에요. "누구에게(간접목적어, IO) 무엇을(직접목적어, DO) ~해 주다"라는 뜻이에요. 간접목적어와 직접목적어는 서로 같은 말이 아니에요(IO ≠ DO).',
    '자주 쓰는 동사: give(주다), show(보여 주다), tell(말해 주다), send(보내 주다), teach(가르쳐 주다), offer(제공하다). 3형식으로 바꾸면 S+V+DO+to/for+IO: give·show·tell·send·teach는 to, buy·make·cook은 for를 써요.',
    [
      ex('The therapist gave the patient a home exercise plan.', '치료사는 환자에게 가정 운동 계획을 주었다.', 'S The therapist / V gave / IO the patient / DO a home exercise plan'),
      ex('She showed him the correct posture.', '그녀는 그에게 올바른 자세를 보여 주었다.', 'S She / V showed / IO him / DO the correct posture'),
      ex('The doctor told us the results.', '의사는 우리에게 결과를 말해 주었다.', 'S The doctor / V told / IO us / DO the results'),
    ],
    [
      {
        q: '"The therapist gave the patient a home exercise plan."에서 간접목적어(IO)는?',
        choices: ['The therapist', 'the patient', 'a home exercise plan'],
        answer: 1,
        explain: '"누구에게 주었나?"에 대한 답이 간접목적어예요. 받는 사람은 the patient이고, 준 물건 a home exercise plan이 직접목적어예요.',
      },
      {
        q: '"She showed him the correct posture."를 3형식으로 바꾸면?',
        choices: ['She showed the correct posture to him.', 'She showed the correct posture for him.', 'She showed him to the correct posture.'],
        answer: 0,
        explain: 'show는 직접목적어를 먼저 쓰고 전치사 to로 받는 사람을 연결해요. for는 buy, make 같은 동사에 써요.',
      },
      {
        q: '4형식 문장의 뜻 구조로 알맞은 것은?',
        choices: ['누구에게 무엇을 (해 준다)', '무엇을 어떤 상태가 되게 (한다)', '주어가 어떤 상태이다'],
        answer: 0,
        explain: '4형식은 "누구에게 무엇을 ~해 준다"예요. 두 번째 뜻은 5형식, 세 번째 뜻은 2형식이에요.',
      },
    ],
  ),
  make(
    5,
    '5형식 (S+V+O+OC)',
    'Sentence pattern 5: S + V + O + OC',
    '목적어(O) 뒤에 목적격 보어(OC)가 와서 목적어가 어떤 상태가 되는지, 무엇으로 불리는지를 설명하는 문장이에요. "O를 OC로 만든다/여긴다"라는 뜻이고, 목적어와 보어는 서로 같은 관계예요(O = OC).',
    '자주 쓰는 동사: make(~하게 만들다), keep(~인 채로 두다), find(~라고 느끼다), consider(~라고 여기다), call(~라고 부르다), leave(~인 채로 두다). 4형식과 구별하는 법: gave me a note는 me ≠ a note, made me happy는 me = happy예요.',
    [
      ex('Exercise makes muscles stronger.', '운동은 근육을 더 강하게 만든다.', 'S Exercise / V makes / O muscles / OC stronger'),
      ex('The brace keeps the knee stable.', '보조기는 무릎을 안정된 상태로 유지해 준다.', 'S The brace / V keeps / O the knee / OC stable'),
      ex('Doctors consider this treatment safe.', '의사들은 이 치료가 안전하다고 여긴다.', 'S Doctors / V consider / O this treatment / OC safe'),
    ],
    [
      {
        q: '"Exercise makes muscles stronger."에서 목적격 보어(OC)는?',
        choices: ['muscles', 'stronger', 'makes'],
        answer: 1,
        explain: 'muscles(목적어)가 어떤 상태가 되는지 말해 주는 stronger가 보어예요. 근육 = 더 강한 상태, 즉 O = OC 관계예요.',
      },
      {
        q: 'The brace ____ the knee stable.',
        choices: ['keeps', 'goes', 'arrives'],
        answer: 0,
        explain: 'keeps(~인 채로 유지하다)는 O와 OC를 함께 받을 수 있어요. goes와 arrives는 목적어를 받지 않는 동사라서 쓸 수 없어요.',
      },
      {
        q: '5형식에서 목적어(O)와 목적격 보어(OC)의 관계는?',
        choices: ['목적어가 보어의 상태나 이름이다 (O = OC)', '목적어가 주어와 같다', '보어가 동사를 꾸며 준다'],
        answer: 0,
        explain: 'muscles = stronger처럼 "근육이 더 강하다"는 관계가 속에 들어 있어요. 그래서 4형식(IO ≠ DO)과 구별돼요.',
      },
    ],
  ),
];

const BASIC_BY_ID: Record<string, GrammarItem> = Object.fromEntries(BASIC_GRAMMAR.map((g) => [g.id, g]));

/** 기본 문법 id인지 */
export function isBasicGrammarId(id: string): boolean {
  return id in BASIC_BY_ID;
}

/** 기본 문법 내용 + 내가 바꾼 상태(알아요/공부 중)를 합쳐서 돌려준다. 기본 문법이 아니면 null. */
export function resolveBasicGrammar(data: AppData, id: string): GrammarItem | null {
  const base = BASIC_BY_ID[id];
  if (!base) return null;
  const saved = data.grammar?.[id];
  return { ...base, status: saved && !saved.deleted ? saved.status : base.status };
}

/** 기본 문법 5개 전체 (상태 반영) */
export function basicGrammarList(data: AppData): GrammarItem[] {
  return BASIC_GRAMMAR.map((g) => resolveBasicGrammar(data, g.id) as GrammarItem);
}
