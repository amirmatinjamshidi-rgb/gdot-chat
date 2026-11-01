using GdotChat.Domain.Exceptions;

namespace GdotChat.Application.Security;

public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    public static void Validate(string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
            throw new WeakPasswordException("Password is required");

        if (password.Length < MinLength)
            throw new WeakPasswordException($"Password must be at least {MinLength} characters");

        if (password.Length > MaxLength)
            throw new WeakPasswordException($"Password must be at most {MaxLength} characters");

        // Reject any whitespace (leading/trailing/embedded).
        if (password.Any(char.IsWhiteSpace))
            throw new WeakPasswordException("Password must not contain whitespace");
    }
}
