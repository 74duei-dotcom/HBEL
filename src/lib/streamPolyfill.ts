// Safari(아이패드·아이폰)는 ReadableStream을 `for await (... of stream)`으로 읽는 기능이 없습니다.
// 오픈소스 음성의 발음 변환 엔진(phonemizer)이 시작할 때 이 문법으로 사전 데이터를 풀기 때문에,
// 이 기능이 없으면 엔진이 영원히 준비되지 않고 멈춥니다 → 엔진보다 먼저 이 코드로 기능을 채워 넣음.
type AsyncIterableStream = { getReader: () => ReadableStreamDefaultReader<unknown> };

if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: AsyncIterableStream) {
      const reader = this.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export {};
