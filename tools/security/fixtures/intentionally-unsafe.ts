// Deliberate non-executed test fixture: scanner MUST flag the eval below.
// Never import or execute this file.
function intentionallyUnsafeInput(value: string) {
  return eval(value);
}
void intentionallyUnsafeInput;
