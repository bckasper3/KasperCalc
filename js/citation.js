function formatAccessDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function generateCitation() {
  const now         = new Date();
  const currentYear = now.getFullYear();
  const accessDate  = formatAccessDate(now);
  const siteName    = 'KasperCalc';
  const url         = window.location.href;

  // Strips "KasperCalc: " prefix if present, falls back to full title
  const rawTitle  = document.title;
  const pageTitle = rawTitle.includes(': ')
    ? rawTitle.split(': ').slice(1).join(': ')
    : rawTitle;

  return `${siteName} (${currentYear}). ${pageTitle}. [online] Available at: ${url} [Accessed ${accessDate}].`;
}

document.getElementById('citationText').innerText = generateCitation();