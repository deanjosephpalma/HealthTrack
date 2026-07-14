export const ROLES = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
}

export const MODULES = {
  OVERVIEW: 'overview',
  PATIENTS: 'patients',
  INVENTORY: 'inventory',
  QUEUE: 'queue',
  DOCTOR_CONSULT: 'doctor-consult',
  NURSE_SERVICE_DESK: 'nurse-service-desk',
  ARCHIVE: 'archive',
  HEAT_MAP: 'heat-map',
  REPORTS: 'reports',
  // New workflow modules
  WORKFLOW: 'workflow',
  FOLLOW_UPS: 'follow-ups',
  REPORTED_CASES: 'reported-cases',
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
  ],
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
  [MODULES.QUEUE]: {
    label: 'Queue',
    path: '/dashboard/queue',
    icon: 'queue',
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
