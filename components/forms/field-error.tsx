export function FieldError({
  id,
  message,
  role,
}: {
  id?: string;
  message?: string;
  role?: "alert";
}) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} role={role} className="text-sm text-red-500">
      {message}
    </p>
  );
}
