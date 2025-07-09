# Security Policy

## Supported Versions

We actively support the following versions of Unity Documentation MCP Server:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Unity Documentation MCP Server, please report it responsibly:

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Send an email to: [security@your-domain.com] (replace with actual email)
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested fix (if available)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Investigation**: We will investigate the issue and provide an initial assessment within 5 business days
- **Resolution**: We will work to resolve the issue as quickly as possible
- **Disclosure**: We will coordinate with you on the disclosure timeline

### Security Best Practices

When using Unity Documentation MCP Server:

1. **Keep Dependencies Updated**: Regularly update to the latest version
2. **Secure Configuration**: Use proper file permissions for configuration files
3. **Network Security**: Run the server in a secure network environment
4. **Input Validation**: Be cautious with user-provided search queries
5. **File System Access**: Ensure proper access controls for data directories

### Known Security Considerations

- This server processes Unity documentation files, which are trusted content
- The server uses SQLite for data storage, which is generally secure for local use
- Network communication is limited to downloading Unity documentation
- No external API keys or sensitive credentials are required

### Updates and Patches

Security updates will be released as patch versions and announced through:
- GitHub Releases
- Security advisories
- README updates

## Contact

For security-related questions or concerns:
- Email: [security@your-domain.com]
- GitHub: [@zabaglione](https://github.com/zabaglione)

Thank you for helping keep Unity Documentation MCP Server secure!