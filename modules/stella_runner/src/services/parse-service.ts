import { parseOdometryKeyframeData, normalizeData } from "../utils/parse-data-keyframes";
import { readAndParseFile } from "../lib/read-file";
import type { Logger } from "../utils/logger";

export class ParseService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async parseData(filePath: string) {
    this.logger.info('Parsing data...');
    const data = await readAndParseFile(filePath);
    const parsedData = parseOdometryKeyframeData(data);

    const normalizedData = normalizeData(parsedData);

    this.logger.info('Data parsed and normalized successfully');

    return normalizedData;
  }
}