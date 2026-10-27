// Display-only enrichment of Scout's own transcript. Never borrow a name from
// another lesson, the current form, or Krisp's queue. Explicit labels win.
const NON_NAMES = new Set(('teacher student scout classbuster hello hi hey there everyone everybody buddy friend dear my nice good morning afternoon evening welcome again okay ok yes no thank thanks how what where when why can could would should today and you we i').split(' '));
function validName(value){
  return /^[\p{L}][\p{L}'’-]{0,39}$/u.test(value) &&
    !NON_NAMES.has(value.toLowerCase());
}

export function scoutStudentLabel(record){
  if(record.studentLabel) return record.studentLabel;
  const teacher = String(record.teacherLabel || '').trim().toLowerCase().split(/\s+/)[0];
  const candidates = new Map();
  // Role-labelled, direct address/self-introduction only. Ordinary mentions of
  // story characters and third-person names are deliberately not evidence.
  const lines = String(record.transcript || '').split(/\r?\n/);
  for(const line of lines){
    const role = line.match(/^\s*(?:\[[^\]\r\n]{1,30}\]\s*)?(TEACHER|STUDENT):\s*(.*)$/i);
    if(!role) continue;
    const text = role[2];
    const pattern = role[1].toUpperCase() === 'TEACHER'
      ? /\b(?:hello|hi|hey)(?:[\s,!.]+(?:hello|hi|hey))*[\s,!]+(?:my\s+)?([\p{L}][\p{L}'’-]*)(?=[\s,!.?]|$)/giu
      : /\bmy name is\s+([\p{L}][\p{L}'’-]*)(?=[\s,!.?]|$)/giu;
    for(const match of text.matchAll(pattern)){
      const name = match[1], key = name.toLowerCase();
      if(!validName(name) || key === teacher) continue;
      // Reject sentence continuations ("Hi can you...", "Hi Kevin and Andy").
      const tail = text.slice(match.index + match[0].length);
      if(/^\s+\p{L}/u.test(tail) && !/^\s+(?:nice (?:to see|to meet) you|how are you)\b/i.test(tail)) continue;
      candidates.set(key, name);
    }
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}
