import { parseOdometryKeyframeData, normalizeData } from "../utils/parse-data-keyframes";
import { readAndParseFile } from "../lib/read-file";
import type { Logger } from "../utils/logger";
import { STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE } from "../constant";
import path from "path";

export class ParseService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async parseData(tempDir: string) {
    this.logger.info('Parsing data...');
    const filePath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE);

    const data = await readAndParseFile(filePath);
    const parsedData = parseOdometryKeyframeData(data);

    const normalizedData = normalizeData(parsedData);

    this.logger.info('Data parsed and normalized successfully');

    return normalizedData;
  }
}