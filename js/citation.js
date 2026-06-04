function formatAccessDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function formatAccessDateMLA(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function formatAccessDateIEEE(date) {
  const months = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatAccessDateAPA(date) {
  return date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

function generateCitations() {
  const now          = new Date();
  const year         = now.getFullYear();
  const siteName     = 'KasperCalc';
  const url          = window.location.href;

  const rawTitle  = document.title;
  const pageTitle = rawTitle.includes(': ')
    ? rawTitle.split(': ').slice(1).join(': ')
    : rawTitle;

  const ieeeDate    = formatAccessDateIEEE(now);
  const apaDate     = formatAccessDateAPA(now);
  const gbDate      = formatAccessDate(now);

  return {
    ieee:    `${siteName}, "${pageTitle}," *${siteName}*, ${year}. [Online]. Available: ${url}. [Accessed: ${ieeeDate}].`,
    apa:     `${siteName}. (${year}). ${pageTitle}. Retrieved ${apaDate}, from ${url}`,
    mla:     `"${pageTitle}." *${siteName}*, ${year}, ${url}. Accessed ${gbDate}.`,
    harvard: `${siteName} (${year}) *${pageTitle}* [Online]. Available at: ${url} [Accessed: ${gbDate}].`
  };
}

(function () {
  const c = generateCitations();
  const ieeeEl    = document.getElementById('citationIEEE');
  const apaEl     = document.getElementById('citationAPA');
  const mlaEl     = document.getElementById('citationMLA');
  const harvardEl = document.getElementById('citationHarvard');

  if (ieeeEl)    ieeeEl.innerText    = c.ieee;
  if (apaEl)     apaEl.innerText     = c.apa;
  if (mlaEl)     mlaEl.innerText     = c.mla;
  if (harvardEl) harvardEl.innerText = c.harvard;

  // Legacy single-element support
  const legacy = document.getElementById('citationText');
  if (legacy) legacy.innerText = c.ieee;
})();
