export const ROLES = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  BHW: 'BHW',
  VOLUNTEER: 'Volunteer',
}

/** Roles allowed on the staff (HealthTrackWEB) portal login. */
export const STAFF_PORTAL_ROLES = [ROLES.DOCTOR, ROLES.NURSE, ROLES.BHW, ROLES.VOLUNTEER]

/** BHW / Volunteer — encode patient visits then issue queue numbers. */
export const ENCODER_ROLES = [ROLES.BHW, ROLES.VOLUNTEER]

export function isEncoderRole(role) {
  return ENCODER_ROLES.includes(role)
}

export function isStaffPortalRole(role) {
  return STAFF_PORTAL_ROLES.includes(role)
}

export const MODULES = {
  OVERVIEW: 'overview',
  PATIENTS: 'patients',
  INVENTORY: 'inventory',
  QUEUE: 'queue',
  STAFF_ENCODE: 'staff-encode',
  DOCTOR_CONSULT: 'doctor-consult',
  NURSE_SERVICE_DESK: 'nurse-service-desk',
  ARCHIVE: 'archive',
  HEAT_MAP: 'heat-map',
  REPORTS: 'reports',
  WORKFLOW: 'workflow',
  FOLLOW_UPS: 'follow-ups',
  REPORTED_CASES: 'reported-cases',
  ACCOUNTS: 'accounts',
}

export const ROLE_PERMISSIONS = {
  [ROLES.DOCTOR]: [
    MODULES.OVERVIEW,
    MODULES.DOCTOR_CONSULT,
    MODULES.QUEUE,
    MODULES.PATIENTS,
    MODULES.FOLLOW_UPS,
    MODULES.REPORTED_CASES,
    MODULES.HEAT_MAP,
    MODULES.ACCOUNTS,
  ],
  [ROLES.NURSE]: [
    MODULES.OVERVIEW,
    MODULES.QUEUE,
    MODULES.NURSE_SERVICE_DESK,
    MODULES.PATIENTS,
    MODULES.INVENTORY,
    MODULES.ARCHIVE,
    MODULES.REPORTS,
    MODULES.WORKFLOW,
    MODULES.FOLLOW_UPS,
    MODULES.REPORTED_CASES,
    MODULES.ACCOUNTS,
  ],
  [ROLES.BHW]: [MODULES.OVERVIEW, MODULES.STAFF_ENCODE],
  [ROLES.VOLUNTEER]: [MODULES.OVERVIEW, MODULES.STAFF_ENCODE],
}

export const MODULE_META = {
  [MODULES.OVERVIEW]: {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'grid',
  },
  [MODULES.DOCTOR_CONSULT]: {
    label: 'Doctor Consult',
    path: '/dashboard/doctor-consult',
    icon: 'stethoscope',
  },
  [MODULES.NURSE_SERVICE_DESK]: {
    label: 'Service Desk',
    path: '/dashboard/nurse-service-desk',
    icon: 'clipboard',
  },
  [MODULES.WORKFLOW]: {
    label: 'Workflow',
    path: '/dashboard/workflow',
    icon: 'workflow',
  },
  [MODULES.REPORTED_CASES]: {
    label: 'Reported Cases',
    path: '/dashboard/reported-cases',
    icon: 'clipboard',
  },
  [MODULES.ACCOUNTS]: {
    label: 'Accounts',
    path: '/dashboard/accounts',
    icon: 'users',
  },
  [MODULES.QUEUE]: {
    label: 'Queue',
    path: '/dashboard/queue',
    icon: 'queue',
  },
  [MODULES.STAFF_ENCODE]: {
    label: 'Encode Desk',
    path: '/dashboard/staff-encode',
    icon: 'clipboard',
  },
  [MODULES.PATIENTS]: {
    label: 'Patient Records',
    path: '/dashboard/patient-records',
    icon: 'users',
  },
  [MODULES.FOLLOW_UPS]: {
    label: 'Follow-ups',
    path: '/dashboard/follow-ups',
    icon: 'bell',
  },
  [MODULES.INVENTORY]: {
    label: 'Inventory',
    path: '/dashboard/inventory',
    icon: 'box',
  },

  [MODULES.ARCHIVE]: {
    label: 'Archive',
    path: '/dashboard/archive',
    icon: 'archive',
  },
  [MODULES.HEAT_MAP]: {
    label: 'Heat Map',
    path: '/dashboard/heat-map',
    icon: 'map',
  },
  [MODULES.REPORTS]: {
    label: 'Reports',
    path: '/dashboard/reports',
    icon: 'chart',
  },
}

export function hasModuleAccess(role, moduleKey) {
  if (!role || !ROLE_PERMISSIONS[role]) {
    return false
  }
  return ROLE_PERMISSIONS[role].includes(moduleKey)
}

export function getSidebarModules(role) {
  if (!role || !ROLE_PERMISSIONS[role]) {
    return []
  }
  return ROLE_PERMISSIONS[role]
}
