(() => {
  const emailLink = document.querySelector("[data-about-email]");
  if (!emailLink) return;

  const mailbox = String.fromCharCode(97, 114, 110, 97, 117, 108, 116);
  const host = String.fromCharCode(112, 97, 99, 104, 111, 116, 46, 102, 114);
  emailLink.href = `mailto:${mailbox}@${host}`;
})();
