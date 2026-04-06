## Blueprint usage
When blueprint hints are available for the current domain, prefer using click({selector}) or type({selector}) directly over read_page + ref.
Only use read_page when no hint matches your intent or when you need to discover new elements.
This saves time by skipping the page scan step for elements you already know.
