namespace GdotChat.Domain.Exceptions;

public class UsernameTakenException : Exception
{
    public UsernameTakenException() : base("Username is already taken") { }
}

public class PreKeysExhaustedException : Exception
{
    public PreKeysExhaustedException() : base("One-time pre-keys exhausted") { }
}

public class DeviceNotFoundException : Exception
{
    public DeviceNotFoundException() : base("Device not found") { }
}

public class ForbiddenDeviceException : Exception
{
    public ForbiddenDeviceException() : base("Device access forbidden") { }
}

public class UserNotFoundException : Exception
{
    public UserNotFoundException() : base("User not found") { }
}

public class InvalidCredentialsException : Exception
{
    public InvalidCredentialsException() : base("Invalid credentials") { }
}

public class EnvelopeNotFoundException : Exception
{
    public EnvelopeNotFoundException() : base("Envelope not found") { }
}
