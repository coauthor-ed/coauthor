export function validateBank(bankData) {
  const errors = [];
  if (!bankData.id) errors.push('Missing bank id');
  if (!Array.isArray(bankData.chunks)) errors.push('Missing or invalid chunks array');

  const chunkQuestions = new Set();
  
  for (const chunk of bankData.chunks || []) {
    if (!chunk.file) errors.push('Chunk missing file reference');
    if (!Array.isArray(chunk.questionIds)) errors.push(`Chunk ${chunk.file} missing questionIds`);
    else {
      for (const id of chunk.questionIds) {
        if (chunkQuestions.has(id)) errors.push(`Duplicate questionId across chunks: ${id}`);
        chunkQuestions.add(id);
      }
    }
  }

  if (bankData.typeIndex) {
    for (const [type, data] of Object.entries(bankData.typeIndex)) {
      if (!Array.isArray(data.questionIds)) {
        errors.push(`typeIndex for ${type} missing questionIds array`);
      } else {
        for (const id of data.questionIds) {
          if (!chunkQuestions.has(id)) {
            errors.push(`typeIndex references questionId ${id} not found in any chunk`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
