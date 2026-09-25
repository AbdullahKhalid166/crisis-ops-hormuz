export interface CargoInfo {
  color: string;
  label: string;
  bgLight: string;
  textColor: string;
}

export const CARGO_MAP: Record<string, CargoInfo> = {
  'crude oil': {
    color: '#c2410c',
    label: 'Crude Oil',
    bgLight: '#ffedd5',
    textColor: '#9a3412',
  },
  'lng': {
    color: '#7c3aed',
    label: 'LNG',
    bgLight: '#ede9fe',
    textColor: '#6d28d9',
  },
  'containers': {
    color: '#16a34a',
    label: 'Containers',
    bgLight: '#dcfce7',
    textColor: '#15803d',
  },
  'bulk grain': {
    color: '#ca8a04',
    label: 'Bulk Grain',
    bgLight: '#fef9c3',
    textColor: '#a16207',
  },
  'bulk cement': {
    color: '#ca8a04',
    label: 'Bulk Cement',
    bgLight: '#fef9c3',
    textColor: '#a16207',
  },
  'automobiles': {
    color: '#2563eb',
    label: 'Automobiles',
    bgLight: '#dbeafe',
    textColor: '#1d4ed8',
  },
};

export function getCargoInfo(cargo: string): CargoInfo {
  const lower = (cargo || '').toLowerCase();
  for (const [key, val] of Object.entries(CARGO_MAP)) {
    if (lower.includes(key)) {
      return val;
    }
  }
  return {
    color: '#64748b',
    label: cargo || 'Cargo',
    bgLight: '#f1f5f9',
    textColor: '#475569',
  };
}
