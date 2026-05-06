namespace ViceVector.Api.Models;

public class QueryRequest
{
    public required string Question { get; set; }
    public int? TopK { get; set; }
    public string? SessionId { get; set; }
}

public class ResetSessionRequest
{
    public required string SessionId { get; set; }
}
