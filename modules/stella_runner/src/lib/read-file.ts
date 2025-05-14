import fs from 'fs/promises';

export async function readAndParseFile(filepath: string) {
  try {
    console.log('Reading and parsing file:', {filepath});
    const fileContent = await fs.readFile(filepath, 'utf-8');
    return fileContent;
  } catch (error) {
    console.error('Error reading and parsing txt file:', error);
    throw error;
  }
}