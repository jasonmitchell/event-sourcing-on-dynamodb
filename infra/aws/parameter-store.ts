import * as aws from '@pulumi/aws';
import { Input } from '@pulumi/pulumi';

export const withSecureParameter = (name: string, value: Input<string>, description?: Input<string>) => {
  return new aws.ssm.Parameter(name, {
    description: description,
    type: 'SecureString',
    name: name,
    value: value
  });
};
