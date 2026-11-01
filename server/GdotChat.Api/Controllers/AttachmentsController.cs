using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/attachments")]
public class AttachmentsController : ControllerBase
{
    private readonly IAttachmentService _attachments;
    private readonly AttachmentOptions _options;

    public AttachmentsController(
        IAttachmentService attachments,
        IOptions<AttachmentOptions> options)
    {
        _attachments = attachments;
        _options = options.Value;
    }

    [EnableRateLimiting("attachments-create")]
    [HttpPost]
    public async Task<ActionResult<CreateAttachmentResponse>> CreateAsync(
        [FromBody] CreateAttachmentRequest request,
        CancellationToken ct)
    {
        var created = await _attachments.CreateAsync(User.GetDeviceId(), request, ct);
        return Created(string.Empty, created);
    }

    [EnableRateLimiting("attachments-chunk-upload")]
    [HttpPut("{attachmentId:guid}/chunks/{index:int}")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> PutChunkAsync(Guid attachmentId, int index, CancellationToken ct)
    {
        var max = _options.ChunkSizeBytes + AttachmentOptions.GcmTagBytes + 65_536;
        var feature = HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false })
            feature.MaxRequestBodySize = max;

        await _attachments.PutChunkAsync(
            User.GetDeviceId(),
            attachmentId,
            index,
            Request.Body,
            Request.ContentLength,
            ct);
        return NoContent();
    }

    [HttpGet("{attachmentId:guid}")]
    public async Task<ActionResult<AttachmentStatusDto>> GetStatusAsync(
        Guid attachmentId,
        CancellationToken ct) =>
        Ok(await _attachments.GetStatusAsync(User.GetDeviceId(), attachmentId, ct));

    [HttpPost("{attachmentId:guid}/complete")]
    public async Task<IActionResult> CompleteAsync(Guid attachmentId, CancellationToken ct)
    {
        await _attachments.CompleteAsync(User.GetDeviceId(), attachmentId, ct);
        return NoContent();
    }

    [EnableRateLimiting("attachments-chunk-download")]
    [HttpGet("{attachmentId:guid}/chunks/{index:int}")]
    public async Task GetChunkAsync(Guid attachmentId, int index, CancellationToken ct)
    {
        Response.ContentType = "application/octet-stream";
        await _attachments.GetChunkAsync(User.GetDeviceId(), attachmentId, index, Response.Body, ct);
    }

    [HttpPost("{attachmentId:guid}/download-complete")]
    public async Task<IActionResult> DownloadCompleteAsync(Guid attachmentId, CancellationToken ct)
    {
        await _attachments.DownloadCompleteAsync(User.GetDeviceId(), attachmentId, ct);
        return NoContent();
    }

    [HttpDelete("{attachmentId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid attachmentId, CancellationToken ct)
    {
        await _attachments.DeleteAsync(User.GetDeviceId(), attachmentId, ct);
        return NoContent();
    }
}