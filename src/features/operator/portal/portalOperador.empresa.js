export function createEmptyCompany() {
  return {
    legalName: '',
    rfc: '',
    tradeName: '',
    base: '',
    phone: '',
    email: '',
    address: '',
    legalRepresentative: '',
    jetAPrice: '',
    marginPercent: '',
    fixedFee: '',
    status: 'pendiente',
    approvalStatus: 'pending',
    reviewStatus: 'Sin datos',
    adminValidationStatus: 'draft',
    operatorStatus: 'incomplete',
    adminReviewSubmittedAt: '',
    satValidationStatus: 'pending',
    canRegisterAircraft: false,
    accessEnabled: false,
    adminNotes: '',
    changesNotes: '',
    rejectionReason: '',
    statusSummary: null,
    validationRequirements: [],
    documents: [],
  }
}

export function normalizeMexicanRfc(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export function isValidMexicanRfc(value = '', pattern = /^([A-Z&Ñ]{3,4})\d{6}[A-Z0-9]{3}$/) {
  return pattern.test(normalizeMexicanRfc(value))
}

export function createOperatorPortalCompanyHelpers({
  company,
  companyForm,
  companyDocumentDrafts,
  companyDocumentDefinitions,
}) {
  function clearCompanyDocumentDraft(type = '') {
    companyDocumentDrafts[type] = {
      file: null,
      name: '',
    }
  }

  function syncCompanyForm() {
    companyForm.legalName = company.legalName
    companyForm.rfc = normalizeMexicanRfc(company.rfc)
    companyForm.tradeName = company.tradeName
    companyForm.phone = company.phone
    companyForm.email = company.email
    companyForm.address = company.address
    companyForm.operationalBase = company.base
    companyForm.operationalBaseCode = company.base
    companyForm.legalRepresentative = company.legalRepresentative
    companyForm.jetAPrice = company.jetAPrice
    companyForm.marginPercent = company.marginPercent
    companyForm.fixedFee = company.fixedFee
    companyForm.newDocumentFile = null
    companyForm.newDocumentName = ''
    companyDocumentDefinitions.forEach((definition) => clearCompanyDocumentDraft(definition.id))
  }

  return {
    clearCompanyDocumentDraft,
    syncCompanyForm,
  }
}
