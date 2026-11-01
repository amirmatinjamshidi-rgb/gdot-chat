using GdotChat.Application.DTOs;

namespace GdotChat.Application.Interfaces;

/// <summary>Encrypts/decrypts refresh rotation payloads for short-lived idempotent reuse.</summary>
public interface IRefreshSuccessorProtector
{
    string Protect(AuthResultDto result);
    AuthResultDto Unprotect(string ciphertext);
}
