using GdotChat.Api.Authorization;
using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GdotChat.Api.Controllers;

[Authorize(Policy = ScopePolicies.Groups)]
[ApiController]
[Route("v1/groups")]
public class GroupsController : ControllerBase
{
    private readonly IGroupService _groups;

    public GroupsController(IGroupService groups) => _groups = groups;

    [EnableRateLimiting("groups-create")]
    [HttpPost]
    public async Task<ActionResult<GroupSummaryDto>> CreateAsync(
        [FromBody] CreateGroupRequest request,
        CancellationToken ct)
    {
        var result = await _groups.CreateAsync(User.GetUserId(), User.GetDeviceId(), request, ct);
        return Created($"/v1/groups/{result.Id}", result);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GroupSummaryDto>>> ListMineAsync(CancellationToken ct) =>
        Ok(await _groups.ListMyGroupsAsync(User.GetUserId(), ct));

    [HttpGet("{groupId:guid}/members")]
    public async Task<ActionResult<IReadOnlyList<GroupMemberDto>>> ListMembersAsync(
        Guid groupId,
        CancellationToken ct) =>
        Ok(await _groups.ListMembersAsync(User.GetUserId(), groupId, ct));

    [EnableRateLimiting("groups-mutate")]
    [HttpPost("{groupId:guid}/members")]
    public async Task<IActionResult> AddMembersAsync(
        Guid groupId,
        [FromBody] AddGroupMembersRequest request,
        CancellationToken ct)
    {
        await _groups.AddMembersAsync(User.GetUserId(), User.GetDeviceId(), groupId, request, ct);
        return NoContent();
    }

    [EnableRateLimiting("groups-mutate")]
    [HttpPost("{groupId:guid}/members/remove")]
    public async Task<IActionResult> RemoveMemberAsync(
        Guid groupId,
        [FromBody] RemoveGroupMemberRequest request,
        CancellationToken ct)
    {
        await _groups.RemoveMemberAsync(
            User.GetUserId(), User.GetDeviceId(), groupId, request.UserId, ct);
        return NoContent();
    }

    [EnableRateLimiting("groups-mutate")]
    [HttpPost("{groupId:guid}/leave")]
    public async Task<IActionResult> LeaveAsync(Guid groupId, CancellationToken ct)
    {
        await _groups.LeaveAsync(User.GetUserId(), User.GetDeviceId(), groupId, ct);
        return NoContent();
    }

    [EnableRateLimiting("groups-send")]
    [HttpPost("{groupId:guid}/messages")]
    public async Task<ActionResult<SendGroupMessageResponse>> SendAsync(
        Guid groupId,
        [FromBody] SendGroupMessageRequest request,
        CancellationToken ct)
    {
        var result = await _groups.SendAsync(
            User.GetUserId(), User.GetDeviceId(), groupId, request, ct);
        return Created(string.Empty, result);
    }
}
