// Verify the status fix logic
const testCases = [
  { status: 'Running', statusHistory: [] },
  { status: '', statusHistory: ['Running', 'Complete'] },
  { status: null, statusHistory: ['Merged'] },
  { status: undefined, statusHistory: [] },
  { status: '  ', statusHistory: ['Complete'] },
  { status: 'Complete', statusHistory: ['Running', 'Complete'] },
];

testCases.forEach((run, i) => {
  const status = (typeof run.status === 'string' && run.status.trim())
    ? run.status.trim()
    : (Array.isArray(run.statusHistory) && run.statusHistory.length > 0
        ? String(run.statusHistory[run.statusHistory.length - 1]).trim()
        : '');
  console.log(`Test ${i+1}: run.status=${JSON.stringify(run.status)} -> status=${JSON.stringify(status)}`);
});
