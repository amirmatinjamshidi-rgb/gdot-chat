namespace GdotChat.Application.Options;

public class MinioOptions
{
    public const string SectionName = "Minio";

    public string Endpoint { get; set; } = "127.0.0.1:9000";
    public string AccessKey { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public string Bucket { get; set; } = "gdot-attachments";
    public string Region { get; set; } = "us-east-1";
    public bool UseSsl { get; set; }
    public bool UseServerSideEncryption { get; set; }
}