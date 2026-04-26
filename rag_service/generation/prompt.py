def build_prompt(query, chunks):
    # Extract text from multimodal chunk objects
    text_list = []
    for c in chunks:
        if isinstance(c, dict):
            text_list.append(c.get("text", ""))
        else:
            text_list.append(str(c))
            
    context = "\n\n".join(text_list)

    return f"""
    Answer ONLY using this context.
    If not found, say "I don't know".

    Context:
    {context}

    Question:
    {query}
    """