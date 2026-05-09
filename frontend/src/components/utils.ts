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

export const getErrorColor = (val: number, max: number) => {
  if (max === 0) return 'hsl(120, 80%, 45%)';
  const ratio = Math.min(Math.max(val / max, 0), 1);
  const hue = (1 - ratio) * 120; 
  return `hsl(${hue}, 80%, 45%)`;
};