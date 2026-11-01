import { RegisterRequestSchema } from '@chat/contracts';
import { useState, type FormEvent } from 'react';
import { register, type RegisterField, type RegisterResult } from '@/api/register';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Values = Record<RegisterField, string>;
type Errors = Partial<Record<RegisterField, string>>;

const FIELDS: RegisterField[] = ['username', 'email', 'password', 'nickname'];

/** Client-side check against the same schema the API enforces. */
function validate(values: Values) {
  const result = RegisterRequestSchema.safeParse({
    username: values.username,
    email: values.email,
    password: values.password,
    ...(values.nickname === '' ? {} : { nickname: values.nickname }),
  });
  if (result.success) return { data: result.data, errors: {} as Errors };
  const errors: Errors = {};
  for (const issue of result.error.issues) {
    const name = FIELDS.find((f) => f === issue.path[0]);
    if (name && !(name in errors)) errors[name] = issue.message;
  }
  return { data: undefined, errors };
}

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const [values, setValues] = useState<Values>({
    username: '',
    email: '',
    password: '',
    nickname: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const { data, errors: clientErrors } = validate(values);
    setErrors(clientErrors);
    if (!data) return;

    setSubmitting(true);
    let result: RegisterResult;
    try {
      result = await register(data);
    } finally {
      setSubmitting(false);
    }
    if (result.ok) {
      setCreated(result.user.username);
    } else {
      setErrors(result.fieldErrors);
      setFormError(result.formError);
    }
  }

  if (created !== undefined) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Account created</CardTitle>
          <CardDescription>Welcome, {created}. Your account is ready.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  /** Props shared by every Input: value binding plus `aria-invalid` when the field has an error. */
  const bind = (name: RegisterField) => ({
    id: name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    'aria-invalid': errors[name] ? true : undefined,
  });
  const invalid = (name: RegisterField) => (errors[name] ? true : undefined);

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your information below to create your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup>
            <Field data-invalid={invalid('username')}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input type="text" autoComplete="username" {...bind('username')} />
              {errors.username ? (
                <FieldError>{errors.username}</FieldError>
              ) : (
                <FieldDescription>
                  3-32 letters, digits or underscores. This is how others find you.
                </FieldDescription>
              )}
            </Field>
            <Field data-invalid={invalid('email')}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                type="email"
                placeholder="m@example.com"
                autoComplete="email"
                {...bind('email')}
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>
            <Field data-invalid={invalid('password')}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input type="password" autoComplete="new-password" {...bind('password')} />
              {errors.password ? (
                <FieldError>{errors.password}</FieldError>
              ) : (
                <FieldDescription>Must be 8-128 characters long.</FieldDescription>
              )}
            </Field>
            <Field data-invalid={invalid('nickname')}>
              <FieldLabel htmlFor="nickname">Nickname (optional)</FieldLabel>
              <Input type="text" autoComplete="nickname" {...bind('nickname')} />
              {errors.nickname && <FieldError>{errors.nickname}</FieldError>}
            </Field>
            <Field>
              {formError && <FieldError>{formError}</FieldError>}
              <Button type="submit" disabled={submitting}>
                Create Account
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
