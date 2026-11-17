// Named extractors a Tier A watch may use. Each takes (html, anchor) and returns
// { ok: true, facts } | { ok: false, reason }. Add one only with a fixture and a test.
import { extractNvidiaCourse } from "./nvidia-learning-path.mjs";
import { extractNvidiaExamPrice } from "./nvidia-exam-price.mjs";
export const EXTRACTORS = { "nvidia-learning-path": extractNvidiaCourse, "nvidia-exam-price": extractNvidiaExamPrice };
