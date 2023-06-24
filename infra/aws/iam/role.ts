import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

type RoleOptions = {
  managedPolicyArns?: pulumi.Input<string>[];
  attachedPolicyArns?: pulumi.Input<string>[];
};

export const lambdaRole = (name: string, options?: RoleOptions) => {
  const role = new aws.iam.Role(name, {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: '',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    }),
    managedPolicyArns: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole, ...(options?.managedPolicyArns || [])]
  });

  if (options?.attachedPolicyArns) {
    pulumi.all(options.attachedPolicyArns).apply(attachedPolicyArns => {
      attachedPolicyArns.forEach(policyArn => {
        const policyName = policyArn.split('/').pop();
        new aws.iam.RolePolicyAttachment(`role-${name}-policy-${policyName}`, {
          role: role,
          policyArn: policyArn
        });
      });
    });
  }

  return role;
};
