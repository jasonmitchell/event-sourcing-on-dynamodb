import { Parameter } from '../configuration';

// TODO: error handling
const getParameter = async (name: Parameter, withDecryption: boolean): Promise<string> => {
  const parameterUrl = `http://localhost:2773/systemsmanager/parameters/get/?name=${name}&withDecryption=${withDecryption}`;
  const response = await fetch(parameterUrl, {
    headers: {
      'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN as string
    }
  });

  const data = await response.json();
  return data.Parameter.Value as string;
};

export const getEncryptedParameter = async (name: Parameter): Promise<string> => {
  return getParameter(name, true);
};
