import { Parameter } from '../../configuration';

const getMockParameter = (name: Parameter): string => {
  throw new Error(`Parameter ${name} not found`);
};

export const getEncryptedParameter = async (name: Parameter): Promise<string> => {
  return new Promise(resolve => {
    resolve(getMockParameter(name));
  });
};
