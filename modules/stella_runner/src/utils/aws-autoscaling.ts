import { UpdateAutoScalingGroupCommand } from '@aws-sdk/client-auto-scaling';
import { setupLogger } from './logger.js';
import { autoScalingClient } from './aws-clients.js';

const AUTOSCALING_GROUP_NAME = 'InsvParserGPU AutoScaling Group';

export async function setAutoScalingDesiredCapacity(
  desiredCapacity: number,
  logger = setupLogger()
): Promise<void> {
  try {
    const updateCommand = new UpdateAutoScalingGroupCommand({
      AutoScalingGroupName: AUTOSCALING_GROUP_NAME,
      DesiredCapacity: desiredCapacity,
    });
    await autoScalingClient.send(updateCommand);
    logger.info(
      `Successfully set desired capacity to ${desiredCapacity} for group ${AUTOSCALING_GROUP_NAME}`
    );
  } catch (error) {
    logger.error(
      `Failed to update Auto Scaling group ${AUTOSCALING_GROUP_NAME} to desired capacity ${desiredCapacity}:`,
      error
    );
    throw error;
  }
} 