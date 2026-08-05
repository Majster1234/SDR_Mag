// utils.ts
export const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', 
  '#FFBB28', '#FF8042', '#0088FE', '#ff0055', '#4caf50', '#9c27b0'
];

export const getUnit = (colName: string) => {
  if (colName.startsWith('Cur')) return '%';
  if (colName.startsWith('A')) return '°';
  return '';
};

export const getErrorColor = (value: number, max: number) => {
  if (max === 0) return 'hsl(120, 70%, 50%)'; // Domyślnie zielony
  const ratio = Math.min(value / max, 1);
  
  // Hue 120 = Zielony, Hue 35 = Pomarańczowy. Omijamy całkowicie 0 (Czerwony)
  const hue = 120 - (ratio * 85); 
  return `hsl(${hue}, 80%, 50%)`;
};