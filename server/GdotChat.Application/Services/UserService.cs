using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Mapping;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Application.Services;

public class UserService : IUserService
{
    private readonly DbContext _db;

    public UserService(DbContext db) => _db = db;

    public async Task<User> CreateUserAsync(string username, string passwordHash, CancellationToken ct = default)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            PasswordHash = passwordHash,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        _db.Set<User>().Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }

    public Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default) =>
        _db.Set<User>().FirstOrDefaultAsync(u => u.Username == username, ct);

    public async Task<User> GetByIdAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId, ct);
        return user ?? throw new UserNotFoundException();
    }

    public async Task<IReadOnlyList<UserSummaryDto>> SearchByUsernameAsync(
        string query,
        int limit,
        CancellationToken ct = default)
    {
        var q = query.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(q)) return Array.Empty<UserSummaryDto>();

        limit = Math.Clamp(limit, 1, 30);
        var users = await _db.Set<User>()
            .Where(u => u.Username.StartsWith(q))
            .OrderBy(u => u.Username)
            .Take(limit)
            .ToListAsync(ct);

        return users.Select(DtoMapper.ToDto).ToList();
    }
}
