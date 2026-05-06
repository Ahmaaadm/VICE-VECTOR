namespace ViceVector.Api.Models;

public class OllamaEmbedRequest
{
    public string Model { get; set; } = "";
    public string Input { get; set; } = "";
}

public class OllamaEmbedResponse
{
    public List<List<float>> Embeddings { get; set; } = [];
}
