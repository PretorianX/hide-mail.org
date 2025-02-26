import { parseMultipartMessage } from '../messageParser';

describe('Message Parser', () => {
  test('extracts text content from multipart message', () => {
    const multipartMessage = `
MIME-Version: 1.0
Content-Type: multipart/alternative;
	boundary="b1_phG6iin2uxvWQ9BZg6zgBiT5mTGDAWBZR6EjdvM"
Content-Transfer-Encoding: 8bit

This is a multi-part message in MIME format.
--b1_phG6iin2uxvWQ9BZg6zgBiT5mTGDAWBZR6EjdvM
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

Begin nature main church. Admit total very really stock. Whose Congress interview factor.
Close Mr three put first democratic. Money few agree politics break movement either agree.

--b1_phG6iin2uxvWQ9BZg6zgBiT5mTGDAWBZR6EjdvM
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

<html>
<body>
<p>Begin nature main church. Admit total very really stock. Whose Congress interview factor.</p>
<p>Close Mr three put first democratic. Money few agree politics break movement either agree.</p>
</body>
</html>
--b1_phG6iin2uxvWQ9BZg6zgBiT5mTGDAWBZR6EjdvM--
`;

    const result = parseMultipartMessage(multipartMessage);
    
    expect(result.text).toBe(
      'Begin nature main church. Admit total very really stock. Whose Congress interview factor.\n' +
      'Close Mr three put first democratic. Money few agree politics break movement either agree.'
    );
    
    expect(result.html).toContain('<p>Begin nature main church');
  });
}); 