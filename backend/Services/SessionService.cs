using Microsoft.Extensions.Caching.Memory;

namespace ViceVector.Api.Services;

public record ChatTurn(string Role, string Content);

/// <summary>
/// In-memory session store keyed by sessionId. Each session holds a capped list
/// of recent chat turns. Sliding TTL — sessions expire after inactivity.
/// </summary>
public class SessionService
{
    private readonly IMemoryCache _cache;
    private readonly int _maxPairs;
    private readonly TimeSpan _ttl;

    public SessionService(IMemoryCache cache, IConfiguration config)
    {
        _cache = cache;
        _maxPairs = config.GetValue<int?>("History:MaxPairs") ?? 3;
        var ttlMin = config.GetValue<int?>("History:SessionTtlMinutes") ?? 60;
        _ttl = TimeSpan.FromMinutes(ttlMin);
    }

    public List<ChatTurn> Get(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return [];
        return _cache.TryGetValue<List<ChatTurn>>(Key(sessionId), out var turns) && turns is not null
            ? turns
            : [];
    }

    public void Append(string sessionId, string userMsg, string assistantMsg)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return;
        var turns = Get(sessionId);
        turns.Add(new ChatTurn("user", userMsg));
        turns.Add(new ChatTurn("assistant", assistantMsg));
        var excess = turns.Count - _maxPairs * 2;
        if (excess > 0) turns.RemoveRange(0, excess);
        Save(sessionId, turns);
    }

    public void Reset(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return;
        _cache.Remove(Key(sessionId));
    }

    private void Save(string sessionId, List<ChatTurn> turns)
    {
        _cache.Set(Key(sessionId), turns, new MemoryCacheEntryOptions
        {
            SlidingExpiration = _ttl,
        });
    }

    private static string Key(string sessionId) => $"chat:{sessionId}";
}
