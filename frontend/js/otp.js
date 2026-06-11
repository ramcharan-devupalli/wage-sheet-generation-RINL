function readOtp(length = 6) {
  return Array.from({ length }, (_, index) => document.getElementById(`otp${index}`)?.value || '').join('');
}
