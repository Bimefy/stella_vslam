export type SLAMData = {
  timeCode: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};

export const parseOdometryKeyframeData = (data: string): SLAMData[] => {
  const lines = data.trim().split('\n');
  
  return lines.map((line) => {
    const values = line.trim().split(' ').filter(Boolean).map(Number);
    
    if (values.length !== 8) {
      throw new Error(`Invalid SLAM data format. Expected 8 values, got ${values.length}`);
    }

    const [timeCode, y, z, x, qx, qz, qy, qw] = values as [number, number, number, number, number, number, number, number];
    
    return {
      timeCode,
      x,
      y, 
      z,
      qx,
      qy,
      qz,
      qw
    };
  });
};

export const normalizeData = (data: SLAMData[]) => {
  const xValues = data.map(d => d.x);
  const yValues = data.map(d => d.y);
  const zValues = data.map(d => d.z);

  const minX = Math.min(...xValues);
  const minY = Math.min(...yValues);
  const minZ = Math.min(...zValues);

  const xValuesFromZero = xValues.map(e => e + Math.abs(minX));
  const yValuesFromZero = yValues.map(e => e + Math.abs(minY));
  const zValuesFromZero = zValues.map(e => e + Math.abs(minZ));
  
  const absMaxX = Math.max(...xValuesFromZero);
  const absMaxY = Math.max(...yValuesFromZero);

  let scale = 500 / Math.max(absMaxX, absMaxY)

  if (scale === Infinity) {
    scale = 1
  }

  console.log({scale, absMaxX, absMaxY, minX, minY, minZ})

  return data.map((point, index) => ({
    x: (xValuesFromZero[index] ?? 1) * scale,
    y: (yValuesFromZero[index] ?? 1) * scale,
    z: (zValuesFromZero[index] ?? 1) * scale,
    qx: point.qx,
    qy: point.qy,
    qz: point.qz,
    qw: point.qw,
    timeCode: point.timeCode,
  })) as SLAMData[];
};