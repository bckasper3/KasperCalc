'use strict';
// Client Name composition (§7A)
// Pure function: never writes to record.cells

// Convention IDs (firm picks one globally)
CC.NAME_CONVENTIONS = [
  { id: 'last_first',     label: '{Last}, {First}' },
  { id: 'first_last',     label: '{First} {Last}' },
  { id: 'last_pf_sf',     label: '{Last}, {Primary First} & {Spouse First}' },
  { id: 'pf_sf_last',     label: '{Primary First} & {Spouse First} {Last}' },
];
CC.activeConvention = 'last_first'; // default

CC.composeClientName = (record, convention) => {
  const g = (f) => CC.getCellByField(record, f);

  // Business: default to business_name unless client_name already mapped
  if (record.classification === 'business') {
    return g('client_name') || g('business_name') || '';
  }

  // If a full client_name column is mapped, pass it through unless user picked a convention
  const passThrough = g('client_name');

  const first  = g('first_name').trim();
  const last   = g('last_name').trim();
  const sFirst = g('spouse_first').trim();
  const conv   = convention || CC.activeConvention;

  const hasBoth   = first && last;
  const hasSpouse = sFirst && hasBoth;

  switch (conv) {
    case 'last_first':
      if (hasBoth) return `${last}, ${first}`;
      return last || first || passThrough;

    case 'first_last':
      if (hasBoth) return `${first} ${last}`;
      return first || last || passThrough;

    case 'last_pf_sf':
      if (hasSpouse) return `${last}, ${first} & ${sFirst}`;
      if (hasBoth)   return `${last}, ${first}`;
      return last || first || passThrough;

    case 'pf_sf_last':
      if (hasSpouse) return `${first} & ${sFirst} ${last}`;
      if (hasBoth)   return `${first} ${last}`;
      return first || last || passThrough;

    default:
      return passThrough || (hasBoth ? `${last}, ${first}` : last || first);
  }
};
