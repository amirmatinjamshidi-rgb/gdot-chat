using System.Text;
using System.Threading.RateLimiting;
using GdotChat.Api.Middleware;
using GdotChat.Application.Options;
using GdotChat.Infrastructure;
using GdotChat.Infrastructure.Hubs;
using GdotChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<RelayOptions>(builder.Configuration.GetSection(RelayOptions.SectionName));
builder.Services.Configure<AttachmentOptions>(builder.Configuration.GetSection(AttachmentOptions.SectionName));
builder.Services.Configure<MinioOptions>(builder.Configuration.GetSection(MinioOptions.SectionName));
builder.Services.Configure<RateLimitOptions>(builder.Configuration.GetSection(RateLimitOptions.SectionName));

var attachmentOptions = builder.Configuration.GetSection(AttachmentOptions.SectionName).Get<AttachmentOptions>()
    ?? new AttachmentOptions();
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Limits.MaxRequestBodySize = Math.Max(
        30_000_000,
        attachmentOptions.ChunkSizeBytes + AttachmentOptions.GcmTagBytes + 1_048_576);
});

builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Gdot Chat API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "JWT Authorization header",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            },
            Array.Empty<string>()
        },
    });
});

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? new JwtOptions();
var signingKeyMaterial = ResolveJwtSigningKey(builder.Environment, jwt);
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKeyMaterial));
// Keep options.SigningKey in sync for JwtTokenService (reads IOptions<JwtOptions>).
jwt.SigningKey = signingKeyMaterial;
builder.Services.PostConfigure<JwtOptions>(opts =>
{
    if (string.IsNullOrWhiteSpace(opts.SigningKey))
        opts.SigningKey = signingKeyMaterial;
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // Prefer Items (redacted query) then raw query for hub WebSockets only.
                var path = context.HttpContext.Request.Path;
                if (!path.StartsWithSegments("/hubs"))
                    return Task.CompletedTask;

                if (context.HttpContext.Items.TryGetValue(
                        AccessTokenQueryRedactionMiddleware.HubAccessTokenItemKey,
                        out var stored)
                    && stored is string itemToken
                    && !string.IsNullOrEmpty(itemToken))
                {
                    context.Token = itemToken;
                    return Task.CompletedTask;
                }

                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
});

var rateLimitOptions = builder.Configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>()
    ?? new RateLimitOptions();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("auth-register", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.AuthRegisterPermitLimit,
                Window = TimeSpan.FromSeconds(Math.Max(1, rateLimitOptions.AuthRegisterWindowSeconds)),
                QueueLimit = 0,
            }));

    options.AddPolicy("auth-login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.AuthLoginPermitLimit,
                Window = TimeSpan.FromSeconds(Math.Max(1, rateLimitOptions.AuthLoginWindowSeconds)),
                QueueLimit = 0,
            }));

    options.AddPolicy("auth-refresh", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.AuthRefreshPermitLimit,
                Window = TimeSpan.FromSeconds(Math.Max(1, rateLimitOptions.AuthRefreshWindowSeconds)),
                QueueLimit = 0,
            }));

    options.AddPolicy("messages-send", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.FindFirst("device_id")?.Value ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.MessagesSendPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("users-search", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.FindFirst("sub")?.Value ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.UsersSearchPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("attachments-create", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.FindFirst("device_id")?.Value ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = attachmentOptions.CreatePermitLimit,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("attachments-chunk-upload", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.FindFirst("device_id")?.Value ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = attachmentOptions.ChunkPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("attachments-chunk-download", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.User.FindFirst("device_id")?.Value ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = attachmentOptions.ChunkPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.UseMiddleware<AccessTokenQueryRedactionMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
// LAN phones use http://<ip>:5066; redirecting to HTTPS breaks fetch (untrusted dev cert).
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    app.UseHttpsRedirection();
if (app.Environment.IsDevelopment())
    app.UseCors("DevCors");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<MessageRelayHub>("/hubs/messages");

app.Run();


static string ResolveJwtSigningKey(IHostEnvironment env, JwtOptions jwt)
{
    const int minLength = 32;
    // Fixed local-only key used when Development + UseEphemeralDevelopmentSigningKey.
    // Not a production secret; never commit real keys into appsettings.
    const string ephemeralDevelopmentSigningKey =
        "dev-only-ephemeral-signing-key-do-not-use-in-prod!";

    var key = jwt.SigningKey?.Trim() ?? "";
    if (key.Length >= minLength)
        return key;

    if (env.IsEnvironment("Testing"))
    {
        if (key.Length > 0 && key.Length < minLength)
            throw new InvalidOperationException(
                "Jwt:SigningKey is set but shorter than 32 characters (Testing).");
        return "testing-signing-key-min-32-characters-long!!";
    }

    if (env.IsDevelopment() && jwt.UseEphemeralDevelopmentSigningKey)
        return ephemeralDevelopmentSigningKey;

    throw new InvalidOperationException(
        "Jwt:SigningKey is missing or shorter than 32 characters. "
        + "Set env Jwt__SigningKey (or user-secrets), or for local Development only set "
        + "Jwt:UseEphemeralDevelopmentSigningKey=true. See server/README.md.");
}

public partial class Program;
