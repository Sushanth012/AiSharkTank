export function shouldRetryPitchJobFailure({
  artifactValidationFailed = false,
  reportRetriesExhausted = false
}: {
  artifactValidationFailed?: boolean;
  reportRetriesExhausted?: boolean;
}) {
  return !artifactValidationFailed && !reportRetriesExhausted;
}
