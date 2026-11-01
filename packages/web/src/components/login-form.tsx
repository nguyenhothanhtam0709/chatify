import { LoginRequestSchema } from '@chat/contracts';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router';

type LoginField = 'identifier' | 'password';
type Errors = Partial<Record<LoginField, string>>;

export function LoginForm({ ...props }: React.ComponentProps<typeof Card>) {
  const { signIn } = useAuth();
  const [values, setValues] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = LoginRequestSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === 'identifier' || field === 'password') && !(field in next)) {
          next[field] = 'This field is required.';
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const result = await signIn(parsed.data.identifier, parsed.data.password);
      // On success the session state changes and the app swaps this page for the shell.
      if (!result.ok) setFormError(result.error);
    } finally {
      setSubmitting(false);
    }
  }

  const bind = (name: LoginField) => ({
    id: name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    'aria-invalid': errors[name] ? true : undefined,
  });

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Log in to your account</CardTitle>
        <CardDescription>Enter your username or email and password below</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup>
            <Field data-invalid={errors.identifier ? true : undefined}>
              <FieldLabel htmlFor="identifier">Username or email</FieldLabel>
              <Input type="text" autoComplete="username" {...bind('identifier')} />
              {errors.identifier && <FieldError>{errors.identifier}</FieldError>}
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input type="password" autoComplete="current-password" {...bind('password')} />
              {errors.password && <FieldError>{errors.password}</FieldError>}
            </Field>
            <Field>
              {formError && <FieldError>{formError}</FieldError>}
              <Button type="submit" disabled={submitting}>
                Login
              </Button>
              <FieldDescription className="text-center">
                Don&apos;t have an account?{' '}
                <Link to="/signup" replace>
                  Sign up
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
